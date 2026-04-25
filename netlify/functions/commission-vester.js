// commission-vester.js - Netlify Scheduled Function
// Runs daily at 6am UTC: marks vested commissions as earned
// Schedule: "0 6 * * *" (in netlify.toml)

const { processVesting } = require('./_commission');

exports.handler = async (event) => {
  console.log('[commission-vester] Starting vesting run at', new Date().toISOString());

  try {
    const result = await processVesting();
    console.log(`[commission-vester] Vested ${result.vested} commissions`);
    return { statusCode: 200 };
  } catch (err) {
    console.error('[commission-vester] Error:', err.message);
    return { statusCode: 500 };
  }
};
