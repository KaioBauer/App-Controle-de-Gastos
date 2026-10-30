/** Cache do service worker com as últimas respostas da API (limpo no logout). */
export const API_CACHE_NAME = 'api-data';

/** Payload enviado pelo backend em cada web push. Toda push vira uma notificação visível (exigência do iOS). */
export interface PushPayload {
  title: string;
  body: string;
  /** Caminho interno do app aberto ao tocar na notificação (deep link). */
  url: string;
  /** Agrupa/substitui notificações do mesmo assunto. */
  tag?: string;
  /** Contagem para o ícone (Badging API). */
  badge?: number;
}
