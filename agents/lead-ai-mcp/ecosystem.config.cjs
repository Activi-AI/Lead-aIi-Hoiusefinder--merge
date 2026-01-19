module.exports = {
  apps: [{
    name: 'lead-ai-mcp',
    script: 'npm',
    args: 'start',
    cwd: __dirname,
    interpreter: 'none',
    env: {
      LB_BACKEND_BASE: 'http://49.13.144.44:3003',
      LB_SSH_HOST: 'root@49.13.144.44',
      CA_BACKEND_BASE: 'http://178.156.178.70:3001',
      CA_SSH_HOST: 'root@178.156.178.70',
      SSH_KEY: '/root/.ssh/id_ed25519_cloudagents'
    }
  }]
};