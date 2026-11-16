export const themeStorageKey='learning-stopwatch-theme';
// Apply the saved preference before the page paints; storage may be blocked.
export const themeBootstrap=`try{document.documentElement.dataset.theme=localStorage.getItem('${themeStorageKey}')==='dark'?'dark':'light'}catch{document.documentElement.dataset.theme='light'}`;
