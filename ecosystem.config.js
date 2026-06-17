// pm2 process manager config — runs the OVAL dashboard + the live Play Store puller
// together, auto-restarting on crash and on server reboot.
//   pm2 start ecosystem.config.js && pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: "oval-web",
      cwd: "./oval",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      max_memory_restart: "1G",
      autorestart: true,
    },
    {
      name: "oval-puller",
      script: "scripts/pull_playstore_reviews.py",
      interpreter: "python3",
      args: "--loop 300",
      autorestart: true,
      // restart if it dies; 5s backoff
      restart_delay: 5000,
    },
    {
      name: "oval-playstore-slack",
      script: "scripts/push_playstore_slack_summary.py",
      interpreter: "python3",
      args: "--loop 3600",
      autorestart: true,
      restart_delay: 5000,
    },
  ],
};
