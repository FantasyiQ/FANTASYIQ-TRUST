require('dotenv').config();
const Stripe = require('stripe');
const fs = require('fs');
const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.error('❌ STRIPE_SECRET_KEY not found in .env'); process.exit(1); }
const stripe = Stripe(key);
const results = [];
async function create(name, desc, cents) {
  const product = await stripe.products.create({ name, description: desc });
  const price = await stripe.prices.create({ product: product.id, unit_amount: cents, currency: 'usd', recurring: { interval: 'year' } });
  console.log(`✅ ${name}\n   product: ${product.id}\n   price:   ${price.id}\n`);
  results.push({ name, productId: product.id, priceId: price.id });
}
async function main() {
  console.log('🏈 Creating FantasyIQ Trust — Full Product Catalog\n');
  await create('Player Pro','1-2 league syncs per year',599);
  await create('Player All-Pro','3-5 league syncs per year',1099);
  await create('Player Elite','Unlimited league syncs per year',1799);
  await create('Commissioner Pro — 8 Team','Pro league unlock, 8-team',3999);
  await create('Commissioner Pro — 10 Team','Pro league unlock, 10-team',4999);
  await create('Commissioner Pro — 12 Team','Pro league unlock, 12-team',5999);
  await create('Commissioner Pro — 14 Team','Pro league unlock, 14-team',6999);
  await create('Commissioner Pro — 16 Team','Pro league unlock, 16-team',7999);
  await create('Commissioner Pro — 32 Team','Pro league unlock, 32-team',15999);
  await create('Commissioner All-Pro — 8 Team','All-Pro league unlock, 8-team',6999);
  await create('Commissioner All-Pro — 10 Team','All-Pro league unlock, 10-team',8999);
  await create('Commissioner All-Pro — 12 Team','All-Pro league unlock, 12-team',10499);
  await create('Commissioner All-Pro — 14 Team','All-Pro league unlock, 14-team',12499);
  await create('Commissioner All-Pro — 16 Team','All-Pro league unlock, 16-team',13999);
  await create('Commissioner All-Pro — 32 Team','All-Pro league unlock, 32-team',23999);
  await create('Commissioner Elite — 8 Team','Elite league unlock, 8-team',10999);
  await create('Commissioner Elite — 10 Team','Elite league unlock, 10-team',12999);
  await create('Commissioner Elite — 12 Team','Elite league unlock, 12-team',14999);
  await create('Commissioner Elite — 14 Team','Elite league unlock, 14-team',16999);
  await create('Commissioner Elite — 16 Team','Elite league unlock, 16-team',18999);
  await create('Commissioner Elite — 32 Team','Elite league unlock, 32-team',29999);
  console.log('🎉 ALL 21 PRODUCTS CREATED!');
  fs.writeFileSync('stripe-catalog-ids.json', JSON.stringify(results, null, 2));
  console.log('📄 IDs saved to stripe-catalog-ids.json');
}
main().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
