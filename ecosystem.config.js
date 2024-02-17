module.exports = {
  apps: [
    {
      name: 'tracer',
      script: 'dist/scripts/export/trace.js',
      wait_ready: true,
      listen_timeout: 30000,
    },
    {
      name: 'processor',
      script: 'dist/scripts/export/process.js',
      wait_ready: true,
      listen_timeout: 30000,
    },
    {
      name: 'account-webhooks',
      script: 'dist/scripts/accountWebhooks.js',
      args: ['-c', 'config.accounts.json'],
      kill_timeout: 30000,
    },
    {
      name: 'server_accounts',
      script: 'dist/server/serve.js',
      args: ['-p', '3420', '-c', 'config.accounts.json', '-a'],
      instances: 1,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: 'server',
      script: 'dist/server/serve.js',
      args: ['-p', '3000'],
      instances: 2,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
}
