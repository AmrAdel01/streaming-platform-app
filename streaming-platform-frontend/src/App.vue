<template>
  <div id="app">
    <NavBar />
    <router-view class="main-content" />
  </div>
</template>

<script>
import NavBar from "./components/NavBar.vue";
export default {
  name: "App",
  components: {
    NavBar,
  },
};
</script>
<style scoped>
.main-content {
  padding: 20px;
  min-height: calc(100vh-70px);
}
</style>
