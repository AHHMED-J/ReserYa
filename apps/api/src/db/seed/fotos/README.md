# Fotos de demostración

Una carpeta por negocio (nombre sin acentos ni símbolos, en minúsculas y con guiones, por ejemplo
`barberia-el-patron`) con `1.jpg`, `2.jpg` y `3.jpg`. La 1 es la principal y sale en las tarjetas.

`pnpm db:reset` las copia a `uploads/` y las liga al negocio. Si una carpeta está vacía, el negocio
no tiene fotos y la web muestra el ícono de su categoría.

Formato: horizontal 4:3 (unos 1200 × 900 px), JPG y menos de 400 KB. Sin texto ni marcas reales.
Anota la fuente y la licencia de cada foto en `fuentes.txt`.
