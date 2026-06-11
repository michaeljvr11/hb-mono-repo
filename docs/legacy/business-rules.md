# Business Rules

## Confirmed Business Context

- H&B Ecommerce sells or sources products from South Africa for customers in Namibia.
- Vendor and supplier data matters because the platform is being built around verified businesses, vendor ownership, and supplier relationships.
- Products are part of a marketplace direction, but the current live service also includes manual import requests and quote handling.
- Product handling may involve markup, availability, shipping to Namibia, and vendor/supplier relationships.

## What The Landing Site Confirms

From the current Home, About, Services, and Contact pages:

- H&B positions itself as a bridge between South Africa and Namibia.
- The business currently offers a personal and business import service.
- Customers can request one-off or recurring imports for shops, restaurants, offices, or personal use.
- The business emphasizes transparent quotes, reliable logistics, and direct communication.
- A fuller online marketplace is planned but not yet live.
- Verified SMEs and trusted vendors are part of the future marketplace narrative.
- Contact and quote requests are expected to receive replies within 24 to 48 hours.

## Operational Implications

- Vendor records should be treated as meaningful business entities, not generic users.
- Product and vendor ownership checks matter, especially for vendor-managed resources.
- Public catalog data should stay separate from protected management routes.
- Response models should avoid exposing sensitive user or vendor internals.

## Do Not Assume Without Code Or Documentation

- Checkout flow
- Payment flow
- Tax rules
- Shipping fee calculation rules
- Customs logic
- Final markup formulae
- Order lifecycle rules beyond what is already implemented

These areas should be marked `Needs verification` unless the relevant project already implements them.
