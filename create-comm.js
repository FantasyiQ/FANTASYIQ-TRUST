const fs=require('fs');
const env=fs.readFileSync('.env.local','utf8');
const m=env.match(/STRIPE_SECRET_KEY=(.+)/);
const stripe=require('stripe')(m[1].trim());
const PLANS=[
{tier:'COMMISSIONER_PRO',size:8,amt:3999,name:'Commissioner Pro 8-Team'},
{tier:'COMMISSIONER_PRO',size:10,amt:4999,name:'Commissioner Pro 10-Team'},
{tier:'COMMISSIONER_PRO',size:12,amt:5999,name:'Commissioner Pro 12-Team'},
{tier:'COMMISSIONER_PRO',size:14,amt:6999,name:'Commissioner Pro 14-Team'},
{tier:'COMMISSIONER_PRO',size:16,amt:7999,name:'Commissioner Pro 16-Team'},
{tier:'COMMISSIONER_PRO',size:32,amt:15999,name:'Commissioner Pro 32-Team'},
{tier:'COMMISSIONER_ALL_PRO',size:8,amt:6999,name:'Commissioner All-Pro 8-Team'},
{tier:'COMMISSIONER_ALL_PRO',size:10,amt:8999,name:'Commissioner All-Pro 10-Team'},
{tier:'COMMISSIONER_ALL_PRO',size:12,amt:10499,name:'Commissioner All-Pro 12-Team'},
{tier:'COMMISSIONER_ALL_PRO',size:14,amt:12499,name:'Commissioner All-Pro 14-Team'},
{tier:'COMMISSIONER_ALL_PRO',size:16,amt:13999,name:'Commissioner All-Pro 16-Team'},
{tier:'COMMISSIONER_ALL_PRO',size:32,amt:23999,name:'Commissioner All-Pro 32-Team'},
{tier:'COMMISSIONER_ELITE',size:8,amt:10999,name:'Commissioner Elite 8-Team'},
{tier:'COMMISSIONER_ELITE',size:10,amt:12999,name:'Commissioner Elite 10-Team'},
{tier:'COMMISSIONER_ELITE',size:12,amt:14999,name:'Commissioner Elite 12-Team'},
{tier:'COMMISSIONER_ELITE',size:14,amt:16999,name:'Commissioner Elite 14-Team'},
{tier:'COMMISSIONER_ELITE',size:16,amt:18999,name:'Commissioner Elite 16-Team'},
{tier:'COMMISSIONER_ELITE',size:32,amt:29999,name:'Commissioner Elite 32-Team'}
];
async function run(){
console.log('=== Creating Commissioner Catalog ===\n');
for(const[id,pct]of[['MULTI_LEAGUE_15',15],['MULTI_LEAGUE_25',25]]){
try{await stripe.coupons.retrieve(id);console.log('Coupon '+id+': exists');}
catch{await stripe.coupons.create({id,percent_off:pct,duration:'forever',name:'Multi-League '+pct+'% Discount'});console.log('Coupon '+id+': CREATED');}}
console.log('\n--- Creating Products & Prices ---\n');
const results=[];
for(const p of PLANS){
const prod=await stripe.products.create({name:p.name});
const price=await stripe.prices.create({product:prod.id,unit_amount:p.amt,currency:'usd',recurring:{interval:'year'}});
console.log(p.name+': '+price.id);
results.push({...p,priceId:price.id});}
const pro=env.match(/STRIPE_PRICE_PRO=(.+)/)?.[1]?.trim();
const allpro=env.match(/STRIPE_PRICE_ALL_PRO=(.+)/)?.[1]?.trim();
const elite=env.match(/STRIPE_PRICE_ELITE=(.+)/)?.[1]?.trim();
console.log('\n=== PASTE THIS INTO src/lib/stripe.ts ===\n');
console.log("export const PRICE_MAP: Record<string, { type: string; tier: string; leagueSize: number | null }> = {");
console.log("    '"+pro+"': { type: 'player', tier: 'PLAYER_PRO',           leagueSize: null },");
console.log("    '"+allpro+"': { type: 'player', tier: 'PLAYER_ALL_PRO',        leagueSize: null },");
console.log("    '"+elite+"': { type: 'player', tier: 'PLAYER_ELITE',          leagueSize: null },");
for(const r of results){console.log("    '"+r.priceId+"': { type: 'commissioner', tier: '"+r.tier+"', leagueSize: "+r.size+"  },");}
console.log('};');
console.log('\n=== DONE: '+results.length+' prices created ===');}
run().catch(e=>console.error('Fatal:',e.message));
