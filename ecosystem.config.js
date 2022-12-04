module.exports = {
  apps: [
    {
      name: 'exporter',
      script: 'dist/export/index.js',
    },
    {
      name: 'server',
      script: 'dist/server/index.js',
    },
  ],
}
