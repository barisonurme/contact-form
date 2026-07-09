// ADMIN_PASSWORD_HASH üretir: bun run hash 'sifreniz'
const password = process.argv[2];
if (!password) {
  console.error("Kullanım: bun run hash 'sifreniz'");
  process.exit(1);
}
console.log(await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 12 }));

export {};
