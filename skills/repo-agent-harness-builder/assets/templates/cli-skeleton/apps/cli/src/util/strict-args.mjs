// Parse once at the command boundary. Errors contain flag names, never values.
export function parseCliArgs(argv, { flags = {}, minPositionals = 0, maxPositionals = 0, allowPassthrough = false } = {}) {
  const values = Object.create(null);
  const positionals = [];
  let passthrough = [];
  const fail = (code, message, flag) => ({ ok: false, code, message, details: flag ? [flag] : [] });
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      if (allowPassthrough) passthrough = argv.slice(index + 1);
      else positionals.push(...argv.slice(index + 1));
      break;
    }
    if (!argument.startsWith("-")) {
      positionals.push(argument);
      continue;
    }
    const equals = argument.indexOf("=");
    const flag = equals < 0 ? argument : argument.slice(0, equals);
    if (["__proto__", "prototype", "constructor"].includes(flag.replace(/^-+/, "")) || !Object.hasOwn(flags, flag)) {
      return fail("unknown-flag", "Unknown flag", flag);
    }
    const kind = flags[flag];
    if (!["boolean", "value", "repeatable"].includes(kind)) throw new Error("Invalid CLI flag specification");
    if (kind !== "repeatable" && Object.hasOwn(values, flag)) return fail("duplicate-flag", "Flag may be supplied only once", flag);
    if (kind === "boolean") {
      if (equals >= 0) return fail("unexpected-value", "Boolean flag does not accept a value", flag);
      values[flag] = true;
      continue;
    }
    const value = equals < 0 ? argv[++index] : argument.slice(equals + 1);
    if (value === undefined || !value.trim() || (equals < 0 && value.startsWith("-"))) {
      return fail("missing-value", "Flag requires a nonblank value; use --flag=value for leading hyphens", flag);
    }
    if (kind === "repeatable") (values[flag] ||= []).push(value);
    else values[flag] = value;
  }
  if (positionals.length < minPositionals || positionals.length > maxPositionals) {
    return fail("unexpected-argument", "Incorrect number of positional arguments");
  }
  return { ok: true, values, positionals, passthrough };
}
