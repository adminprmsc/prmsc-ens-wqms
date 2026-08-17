export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  cors: {
    origins: (
      process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3000'
    )
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'wqms-dev-jwt-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  },
  seed: {
    systemAdminEmail:
      process.env.SYSTEM_ADMIN_EMAIL ?? 'system.admin@prmsc.gov.pk',
    systemAdminPassword: process.env.SYSTEM_ADMIN_PASSWORD ?? 'ChangeMe@123',
  },
});
