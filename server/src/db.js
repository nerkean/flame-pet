const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

// В Prisma 7 иногда надежнее передать URL напрямую в конструктор, 
// если конфиг-файл капризничает
const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

module.exports = prisma;