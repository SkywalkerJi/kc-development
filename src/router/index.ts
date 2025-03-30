import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/DevelopmentView.vue'),
      // redirect: '/development',
    },
    // {
    //   path: '/development',
    //   name: 'development',
    //   component: () => import('../views/DevelopmentView.vue'),
    // },
  ],
})

export default router
