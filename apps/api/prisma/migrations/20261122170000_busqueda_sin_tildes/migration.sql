-- LN-05: búsqueda del catálogo sin tildes ni mayúsculas ("baul" encuentra "Baúl").
--
-- unaccent es una extensión estándar de PostgreSQL (contrib) y es "trusted":
-- la puede crear el dueño de la base, sin superusuario.
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- unaccent() no es IMMUTABLE porque depende del diccionario activo. Fijando el
-- diccionario se puede declarar inmutable y usarla en índices si hiciera falta.
CREATE FUNCTION "tk_search_normalize"(input text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT lower(public.unaccent('public.unaccent'::regdictionary, input))
$$;
