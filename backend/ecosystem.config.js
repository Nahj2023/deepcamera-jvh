export default {
  apps: [
    {
      name: 'deepcamera-jvh',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env_production: {
        PORT: 3100,
        NODE_ENV: 'production'
      }
    }
  ]
};
