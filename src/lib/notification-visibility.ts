export function notificationVisibility(userId: string) {
  return { recipientId: userId, OR: [{ contributionId: null }, { project: { isPublic: true } }, { project: { ownerId: userId } }] };
}
