import type { Conversation, Message, MessagePage } from '@kapp/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';

import { apiGet, apiSend } from '@/lib/api';
import { useRealtimeConnected } from '@/lib/realtime';

/** Fallback when the socket is down (docs/12-kogukond.md): an open conversation refetches every 15 s. */
export const POLL_MS = 15_000;

export const conversationKeys = {
  all: ['conversations'] as const,
  list: ['conversations', 'list'] as const,
  detail: (id: string) => ['conversations', 'detail', id] as const,
  messages: (id: string) => ['conversations', 'messages', id] as const,
};

export function useConversations() {
  const live = useRealtimeConnected();
  return useQuery({
    queryKey: conversationKeys.list,
    queryFn: () => apiGet<Conversation[]>('/me/conversations'),
    refetchInterval: live ? false : POLL_MS,
  });
}

export function useConversation(id: string) {
  return useQuery({ queryKey: conversationKeys.detail(id), queryFn: () => apiGet<Conversation>(`/me/conversations/${id}`) });
}

/** Newest first, older pages with the `before` cursor (an inverted list shows them on top). */
export function useMessages(conversationId: string) {
  const live = useRealtimeConnected();
  return useInfiniteQuery({
    queryKey: conversationKeys.messages(conversationId),
    queryFn: ({ pageParam }) =>
      apiGet<MessagePage>(`/me/conversations/${conversationId}/messages`, pageParam ? { before: pageParam, limit: 30 } : { limit: 30 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: live ? false : POLL_MS,
  });
}

/** Puts a message into the cached first page (from the socket or our own send), without duplicates. */
export function addMessageToCache(client: QueryClient, message: Message) {
  client.setQueryData<InfiniteData<MessagePage, string | null>>(conversationKeys.messages(message.conversationId), (data) => {
    if (!data || data.pages.some((p) => p.messages.some((m) => m.id === message.id))) return data;
    const [first, ...rest] = data.pages;
    return { ...data, pages: [{ ...first!, messages: [message, ...first!.messages] }, ...rest] };
  });
}

export function useSendMessage(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => apiSend<Message>('POST', `/me/conversations/${conversationId}/messages`, { body }),
    onSuccess: (message) => {
      addMessageToCache(client, message);
      client.invalidateQueries({ queryKey: conversationKeys.list });
    },
  });
}

export function useMarkConversationRead(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend<void>('PUT', `/me/conversations/${conversationId}/read`),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: conversationKeys.list });
      client.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useStartConversation() {
  return useMutation({ mutationFn: (userId: string) => apiSend<Conversation>('POST', '/me/conversations', { userId }) });
}

/** "Kutsu parki": opens (or creates) the conversation with a friend and sends the invitation text. */
export function useSendInvitation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, body }: { userId: string; body: string }) => {
      const conversation = await apiSend<Conversation>('POST', '/me/conversations', { userId });
      const message = await apiSend<Message>('POST', `/me/conversations/${conversation.id}/messages`, { body });
      return { conversation, message };
    },
    onSuccess: ({ message }) => {
      addMessageToCache(client, message);
      client.invalidateQueries({ queryKey: conversationKeys.list });
    },
  });
}
