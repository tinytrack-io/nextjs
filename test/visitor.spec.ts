import { describe, expect, it } from 'vitest';
import { clientAddress, getVisitorContext } from '../src/visitor';
import { GEO_CONFIG, request } from './helpers';

const source = { trustProxy: 1, geoHeaders: GEO_CONFIG };
const proxied = { trustProxy: 1, geoHeaders: GEO_CONFIG };

describe('visitor metadata', () => {
	it('uses the trusted forwarded address and configured location headers', () => {
		expect(getVisitorContext(request(), source)).toEqual({
			ip: '203.0.113.42',
			country_iso: 'AT',
			region: '9',
			city_name: 'Wien',
			latitude: '48.2082',
			longitude: '16.3738',
		});
	});
	it('reads no location at all until headers are configured', () => {
		const visitor = getVisitorContext(request());
		expect(visitor.ip).toBeUndefined();
		expect(visitor.country_iso).toBeUndefined();
		expect(visitor.city_name).toBeUndefined();
	});
	it('decodes non-ASCII city names and survives malformed encoding', () => {
		expect(getVisitorContext(request('/', { headers: { 'x-geo-city': 'S%C3%A3o%20Paulo' } }), source).city_name).toBe('São Paulo');
		expect(getVisitorContext(request('/', { headers: { 'x-geo-city': '%E0%A4%A' } }), source).city_name).toBeUndefined();
	});
	it('omits invalid coordinates and unknown countries, retaining valid zeroes', () => {
		const bad = getVisitorContext(
			request('/', { headers: { 'x-geo-latitude': '91', 'x-geo-longitude': 'NaN', 'x-geo-country': 'XX' } }),
			source,
		);
		expect(bad.latitude).toBeUndefined();
		expect(bad.longitude).toBeUndefined();
		expect(bad.country_iso).toBeUndefined();
		expect(getVisitorContext(request('/', { headers: { 'x-geo-latitude': '0', 'x-geo-longitude': '0' } }), source)).toMatchObject({
			latitude: '0',
			longitude: '0',
		});
	});
});

describe('client address behind proxies', () => {
	const forwarded = (value: string) => request('/', { headers: { 'x-forwarded-for': value } });

	it('ignores forwarding headers when no proxy is trusted', () => {
		expect(clientAddress(forwarded('198.51.100.1'), 0)).toBeUndefined();
		expect(getVisitorContext(forwarded('198.51.100.1'), { ...source, trustProxy: 0 }).ip).toBeUndefined();
	});
	it('takes the hop the trusted proxy count points at', () => {
		const chain = forwarded('198.51.100.1, 198.51.100.2, 198.51.100.3');
		expect(clientAddress(chain, 1)).toBe('198.51.100.3');
		expect(clientAddress(chain, 2)).toBe('198.51.100.2');
		expect(clientAddress(chain, 3)).toBe('198.51.100.1');
	});
	it('omits the address when the chain is shorter than the trusted hop count', () => {
		expect(clientAddress(forwarded('198.51.100.1'), 4)).toBeUndefined();
	});
	it('omits the address for an empty or unusable chain', () => {
		expect(clientAddress(request('/', {}, null), 1)).toBeUndefined();
		expect(clientAddress(forwarded('bad-ip'), 1)).toBeUndefined();
		expect(getVisitorContext(forwarded('unknown'), proxied).ip).toBeUndefined();
	});
	it('does not read CF or TinyTrack headers as an address', () => {
		const spoofed = request('/', { headers: { 'cf-connecting-ip': '198.51.100.1', 'x-tinytrack-ip': '198.51.100.2' } }, null);
		expect(clientAddress(spoofed, 1)).toBeUndefined();
	});
	it.each(['2001:db8::42', '::ffff:192.0.2.1'])('preserves valid IPv6 %s', (ip) => {
		expect(clientAddress(request('/', {}, ip), 1)).toBe(ip);
	});
	it('strips the port and the link-local zone from a forwarded address', () => {
		expect(clientAddress(request('/', {}, '203.0.113.9:54321'), 1)).toBe('203.0.113.9');
		expect(clientAddress(request('/', {}, '[2001:db8::42]:54321'), 1)).toBe('2001:db8::42');
		expect(clientAddress(request('/', {}, 'fe80::1%eth0'), 1)).toBe('fe80::1');
	});
	it.each(['bad-ip', '300.1.1.1', 'https://example.com', '::gg', '1:2:3'])('rejects invalid address %s', (ip) => {
		expect(clientAddress(request('/', {}, ip), 1)).toBeUndefined();
	});
});
