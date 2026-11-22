// Alta de una cuenta del equipo del panel (LN-04). El CRUD de usuarios desde el
// panel llega en LN-16; mientras tanto, la primera cuenta se crea con:
//
//   pnpm --filter @totalkids/api users:create --email ana@totalkids.cl --name "Ana" --role admin
//
// La contraseña se pide por la terminal sin mostrarla (o se lee de stdin si se
// pasa por tubería). Nunca va como argumento: quedaría en el historial del shell.
import "dotenv/config";

import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { parseArgs } from "node:util";

import { AppError } from "../lib/errors.js";
import { createPrismaClient } from "../lib/prisma.js";
import { createStaffUser, STAFF_ROLES } from "../services/auth.js";

type StaffRole = (typeof STAFF_ROLES)[number];

function usage(message: string): never {
  console.error(`${message}\n
Uso: pnpm users:create --email <correo> --name <nombre> --role <${STAFF_ROLES.join("|")}>`);
  process.exit(1);
}

/** Lee una línea sin eco cuando hay terminal; si no, la primera línea de stdin. */
async function readPassword(prompt: string): Promise<string> {
  const interactive = process.stdin.isTTY;
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: interactive });
  try {
    return await new Promise<string>((resolve) => {
      rl.question(prompt, (answer) => {
        if (interactive) process.stdout.write("\n");
        resolve(answer);
      });
      muted = interactive;
    });
  } finally {
    rl.close();
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string" },
    },
  });
  if (!values.email || !values.name || !values.role) usage("Faltan datos.");
  if (!(STAFF_ROLES as readonly string[]).includes(values.role))
    usage(`Rol inválido: ${values.role}`);

  const url = process.env.DATABASE_URL;
  if (!url) usage("Falta DATABASE_URL (copia apps/api/.env.example a .env).");

  const password = await readPassword("Contraseña (mínimo 12 caracteres): ");
  if (process.stdin.isTTY) {
    const again = await readPassword("Repite la contraseña: ");
    if (again !== password) usage("Las contraseñas no coinciden.");
  }

  const prisma = createPrismaClient(url);
  try {
    const user = await createStaffUser(prisma, {
      email: values.email,
      name: values.name,
      role: values.role as StaffRole,
      password,
    });
    console.log(`Cuenta creada: ${user.email} (${user.role}).`);
  } catch (error) {
    if (error instanceof AppError) usage(error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

await main();
