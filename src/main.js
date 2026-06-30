import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from '@/App.vue';
import { setSeedTransactions } from '@/stores/warehouse';
import router from '@/router';
import '@/assets/main.css';

// Supervisor testing: start with empty Purchase Orders / Sales Orders / Returns.
setSeedTransactions(false);
const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
