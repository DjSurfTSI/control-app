module.exports = {
  apps: [
    {
      name: 'control-app',
      cwd: __dirname + '/../server',
      script: 'index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      // CLIP + sharp при загрузке фото; 300M вызывало 502 (pm2 перезапускал процесс)
      max_memory_restart: '900M',
      node_args: '--max-old-space-size=512',
      env_file: __dirname + '/../server/.env',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
  ],
};
