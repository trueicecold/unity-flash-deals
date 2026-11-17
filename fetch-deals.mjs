#!/usr/bin/env node
// Fetches every Unity Asset Store flash deal and writes deals.json next to this file.
// Usage: node fetch-deals.mjs   (Node 18+, no dependencies)
//
// The Asset Store embeds a short-lived anonymous Coveo search token in its listing
// page. We read that token, then query Coveo for all products in the
// "flash_deal" sale filter, paging until we have them all.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const LISTING_URL = 'https://assetstore.unity.com/listing?f-ec_sale_filters=flash_deal';
const DEFAULT_SEARCH_URL = 'https://unitytechnologiesproductionmkahteav.org.coveo.com/rest/search/v2';
const UA = 'Mozilla/5.0 (compatible; flash-deals-fetcher)';
const PAGE_SIZE = 500;
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'deals.json');

async function getSearchConfig() {
    const res = await fetch(LISTING_URL, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`Listing page returned HTTP ${res.status}`);
    const html = await res.text();
    // The page's data is JSON inside a JS string, so quotes may be backslash-escaped.
    const token = /accessToken\\?"\s*:\s*\\?"(eyJ[\w-]+\.[\w-]+\.[\w-]+)/.exec(html);
    if (!token) throw new Error('Could not find the Coveo access token in the listing page');
    const url = /(https:\/\/[\w-]+\.org\.coveo\.com\/rest\/search\/v2)/.exec(html);
    return { token: token[1], searchUrl: url ? url[1] : DEFAULT_SEARCH_URL };
}

async function search({ token, searchUrl }, firstResult) {
    const body = {
        q: '',
        searchHub: 'Assetstore_Listing',
        locale: 'en-US',
        timezone: 'UTC',
        context: { website: 'assetstore', language: 'en-US', userGroups: ['assetStoreUsers'] },
        fieldsToInclude: [
            'permanentid', 'ec_name', 'ec_sale', 'ec_thumbnails', 'ec_price', 'ec_rating',
            'ec_rating_count', 'ec_category', 'publisher_name', 'ec_flash_teaser_starts_at',
            'ec_flash_promo_starts_at',
        ],
        facets: [{
            field: 'ec_sale_filters', facetId: 'ec_sale_filters', type: 'specific',
            numberOfValues: 10, currentValues: [{ value: 'flash_deal', state: 'selected' }],
        }],
        sortCriteria: 'relevancy',
        numberOfResults: PAGE_SIZE,
        firstResult,
    };
    const res = await fetch(searchUrl, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': UA,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Coveo search returned HTTP ${res.status}: ${await res.text()}`);
    return res.json();
}

function toDeal(result) {
    const raw = result.raw || {};
    let sale;
    try { sale = JSON.parse(raw.ec_sale || '[]'); } catch { return null; }
    const tiers = sale
        .filter((t) => t && t.dates && t.dates.starts)
        .map((t) => ({
            starts: t.dates.starts,
            ends: t.dates.ends || null,
            teaser: t.dates.teaserStarts || null,
            flash: t.type === 'flash_deal_time_based',
            prices: t.prices || {},
            discount: t.discount && t.discount.type === 'percentage' ? Number(t.discount.value) : null,
        }))
        .sort((a, b) => Date.parse(a.starts) - Date.parse(b.starts));
    if (!tiers.some((t) => t.flash)) return null;

    const categories = (raw.ec_category || []).map((c) => c.trim()).filter(Boolean);
    const id = String(raw.permanentid || '');
    return {
        id,
        name: raw.ec_name || result.title,
        publisher: raw.publisher_name || '',
        url: result.clickUri || `https://assetstore.unity.com/packages/package/${id}`,
        thumb: raw.ec_thumbnails || '',
        price: raw.ec_price ?? null,
        rating: raw.ec_rating ?? 0,
        ratingCount: raw.ec_rating_count ?? 0,
        category: categories[0] || '',
        subcategory: categories.length > 1 ? categories[categories.length - 1] : '',
        tiers,
    };
}

async function main() {
    const config = await getSearchConfig();
    const deals = [];
    let total = Infinity;
    for (let first = 0; first < total; first += PAGE_SIZE) {
        const page = await search(config, first);
        total = page.totalCount ?? 0;
        for (const r of page.results || []) {
            const d = toDeal(r);
            if (d) deals.push(d);
        }
        if (!page.results || page.results.length === 0) break;
    }
    const out = { generatedAt: new Date().toISOString(), count: deals.length, deals };
    await writeFile(OUT, JSON.stringify(out));
    console.log(`Wrote ${deals.length} flash deals to ${OUT}`);
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
