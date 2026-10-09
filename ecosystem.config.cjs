const path = require('node:path');

module.exports = {
  apps: [{
    name: process.env.DEPLOY_PM2_APP_NAME || 'initd',
    cwd: __dirname,
    script: 'server.js',
    node_args: '--env-file=' + path.join(__dirname, '.env'),
    env: { NODE_ENV: 'production', PORT: '3000' },
    time: true
  }]
};
