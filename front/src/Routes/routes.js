
export const ROUTES = {
  home: '/',
  login: '/login',
  register: '/register',
  onboarding: '/onboarding',
  profile: '/profile',
  addMember: '/add-member',
  chats: '/chats',
  chat: '/chats/:id',
}

/** Builds the path to a single conversation. */
export const chatPath = (id) => `/chats/${id}`
