const ROOT_VIEW = /[\\/]src[\\/]root-ui[\\/]view[\\/].+\.svelte$/;

export default {
  vitePlugin: {
    dynamicCompileOptions: ({ filename }) => ROOT_VIEW.test(filename) ? { generate: 'server' } : undefined,
  },
};
