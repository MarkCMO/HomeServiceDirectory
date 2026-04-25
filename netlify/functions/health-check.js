// health-check.js - Simple health check endpoint
// GET /api/health-check

exports.handler = async () => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'ok',
      service: 'HomeServiceDirectory',
      timestamp: new Date().toISOString()
    })
  };
};
