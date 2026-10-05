import type { PlacePost } from '@kapp/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { errorMessage } from '@/lib/api';
import { mapCategoryForPost } from '@/lib/explore';
import { haptic } from '@/lib/haptics';
import { focusMap } from '@/state/explore-view';

import { useDeletePlacePost } from './use-explore';

/**
 * What the post card's buttons do, shared by the Avasta feed, the post page and "Minu soovitused":
 * "Kaardil" switches the Kaart tab to the map centred on the place; "…" offers the existing safety
 * flows for others' posts (report the post, report or block the author — docs/12) and deletion
 * for the author's own.
 */
export function usePlacePostActions() {
  const { t } = useTranslation();
  const remove = useDeletePlacePost();

  function showOnMap(post: PlacePost) {
    focusMap({ lat: post.lat, lng: post.lng, category: mapCategoryForPost(post.category) });
    router.navigate('/map');
  }

  function confirmDelete(post: PlacePost, onDeleted?: () => void) {
    haptic('warning');
    Alert.alert(t('explore.delete.title'), t('explore.delete.body', { name: post.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          remove.mutate(post.id, {
            onSuccess: onDeleted,
            onError: (e) => Alert.alert(t('explore.delete.failed'), errorMessage(e)),
          }),
      },
    ]);
  }

  function openMenu(post: PlacePost, onDeleted?: () => void) {
    if (post.isMine) {
      Alert.alert(post.name, undefined, [
        { text: t('explore.delete.action'), style: 'destructive', onPress: () => confirmDelete(post, onDeleted) },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
      return;
    }
    Alert.alert(post.name, undefined, [
      { text: t('explore.report.action'), onPress: () => router.push({ pathname: '/report-post', params: { postId: post.id, name: post.name } }) },
      {
        text: t('explore.report.author', { name: post.author.firstName }),
        onPress: () => router.push({ pathname: '/report-user', params: { userId: post.author.id, name: post.author.firstName } }),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  return { showOnMap, openMenu };
}
