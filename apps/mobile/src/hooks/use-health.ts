import type { HealthRecord, HealthRecordInput, HealthReminder, UpdateHealthRecordInput } from '@kapp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiSend } from '@/lib/api';

/** Health records are private to the owner; every change can also change the reminders list. */
export const healthKeys = {
  all: ['health'] as const,
  dog: (dogId: string) => ['health', 'dog', dogId] as const,
  reminders: ['health', 'reminders'] as const,
};

export function useHealthRecords(dogId: string) {
  return useQuery({ queryKey: healthKeys.dog(dogId), queryFn: () => apiGet<HealthRecord[]>(`/me/dogs/${dogId}/health-records`) });
}

export function useHealthReminders() {
  return useQuery({ queryKey: healthKeys.reminders, queryFn: () => apiGet<HealthReminder[]>('/me/health-reminders') });
}

/** Create (no recordId) or update; invalidates the dog's records and the reminders. */
export function useSaveHealthRecord(dogId: string, recordId?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: HealthRecordInput | UpdateHealthRecordInput) =>
      recordId
        ? apiSend<HealthRecord>('PATCH', `/me/dogs/${dogId}/health-records/${recordId}`, input)
        : apiSend<HealthRecord>('POST', `/me/dogs/${dogId}/health-records`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: healthKeys.all }),
  });
}

export function useDeleteHealthRecord(dogId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (recordId: string) => apiSend<void>('DELETE', `/me/dogs/${dogId}/health-records/${recordId}`),
    onSuccess: () => client.invalidateQueries({ queryKey: healthKeys.all }),
  });
}
