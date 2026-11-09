// 탈퇴: 그 사용자의 Firestore 데이터를 모두 지운 뒤 마지막에 Firebase 계정을 지운다(4.6-1).
// 중간에 끊기면 다시 불렀을 때 남은 데이터부터 지우고 계정을 지운다(4.6-2).
export interface DeleteAccountSteps {
  removeData: () => Promise<void>;
  removeUser: () => Promise<void>;
  // 최근 로그인이 필요하면 로그인 창으로 다시 인증한다.
  reauthenticate: () => Promise<void>;
}

const needsRecentLogin = (e: unknown) => (e as { code?: unknown } | null)?.code === 'auth/requires-recent-login';

export async function deleteAccount(steps: DeleteAccountSteps): Promise<void> {
  await steps.removeData();
  try {
    await steps.removeUser();
  } catch (e) {
    if (!needsRecentLogin(e)) throw e;
    await steps.reauthenticate();
    // 다시 인증하는 사이 다른 기기에서 쓴 것이 있으면 함께 지운다.
    await steps.removeData();
    await steps.removeUser();
  }
}
