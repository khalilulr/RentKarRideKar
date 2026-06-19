const fs = require('fs');
const path = require('path');

const swaggerPath = path.join(__dirname, '../swagger.json');
const swagger = JSON.parse(fs.readFileSync(swaggerPath, 'utf8'));

for (const [route, pathObj] of Object.entries(swagger.paths)) {
  for (const [method, operation] of Object.entries(pathObj)) {
    let tag = 'Other Services';
    
    if (route.startsWith('/auth/drivers') || route.startsWith('/drivers/trusted') || route.includes('trusted')) {
      tag = 'Trusted Driver Service';
    } else if (route.startsWith('/auth') || route.startsWith('/me/addresses') || route.startsWith('/me/device-token')) {
      tag = 'Auth & Profile Service';
    } else if (route.startsWith('/kyc')) {
      tag = 'KYC & Verification Service';
    } else if (route.startsWith('/vehicles')) {
      tag = 'Vehicle Service';
    } else if (route.startsWith('/cart')) {
      tag = 'Cart Service';
    } else if (route.startsWith('/owner/earnings') || route.startsWith('/owner/payouts') || route.startsWith('/driver/earnings')) {
      tag = 'Earnings & Payout Service';
    } else if (route.startsWith('/referrals') || route.includes('referral') || route.includes('wallet')) {
      tag = 'Wallet & Referral Service';
    } else if (route.includes('dispute')) {
      tag = 'Dispute Service';
    } else if (route.startsWith('/reviews') || route.startsWith('/ratings')) {
      tag = 'Ratings & Reviews Service';
    } else if (route.startsWith('/communication') || route.includes('chat') || route.includes('sos')) {
      tag = 'Communication Service';
    } else if (route.startsWith('/admin')) {
      tag = 'Admin Service';
    } else if (route.startsWith('/orders')) {
      tag = 'Order Service';
    }

    operation.tags = [tag];
  }
}

fs.writeFileSync(swaggerPath, JSON.stringify(swagger, null, 2), 'utf8');
console.log('Successfully tagged all swagger endpoints!');
