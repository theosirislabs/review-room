export function removeQueryParam(search: string, param: string): string {
  const params = new URLSearchParams(search);
  params.delete(param);
  const query = params.toString();
  return query ? `?${query}` : "";
}
