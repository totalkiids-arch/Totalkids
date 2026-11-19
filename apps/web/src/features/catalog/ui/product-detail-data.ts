import { cache } from "react";

import { getProductDetail } from "../container";

/**
 * Ficha memoizada por petición: generateMetadata y la pantalla la piden con el
 * mismo slug y el adaptador se consulta una sola vez.
 */
export const loadProductDetail = cache((slug: string) => getProductDetail(slug));
