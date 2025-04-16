import { createStore } from "vuex";

export default createStore({
  state: {
    auth: {
      user: null,
      token: null,
    },
  },
  mutations: {
    setUser(state, { user, token }) {
      state.auth.user = {
        id: user._id || user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        following: user.following || [],
      };
      state.auth.token = token;
    },
    clearUser(state) {
      state.auth.user = null;
      state.auth.token = null;
    },
  },
  actions: {
    login({ commit }, { user, token }) {
      commit("setUser", { user, token });
      localStorage.setItem("token", token);
    },
    logout({ commit }) {
      commit("clearUser");
      localStorage.removeItem("token");
    },
  },
  getters: {
    isAuthenticated: (state) => !!state.auth.user,
    user: (state) => state.auth.user,
    token: (state) => state.auth.token,
  },
});
