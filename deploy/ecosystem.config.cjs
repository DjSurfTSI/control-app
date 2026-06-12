module.exports = {
  apps: [
    {
      name: 'control-app',
      cwd: __dirname + '/../server',
      script: 'index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env_file: __dirname + '/../server/.env',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
  ],
};
