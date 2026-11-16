/**
 * Valida body, query y params con Zod (RNF-09). Lo validado queda en req.valid.
 * Uso: router.post('/x', validate({ body: schema }), handler)
 */
export const validate = (schemas) => (req, _res, next) => {
  req.valid = req.valid ?? {};
  for (const part of ['params', 'query', 'body']) {
    if (schemas[part]) req.valid[part] = schemas[part].parse(req[part] ?? {});
  }
  next();
};
