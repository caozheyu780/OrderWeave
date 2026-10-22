import {createLocalWorkspace} from './local-workspace.js';
let demo;
// Keep the existing frontend call boundary; the competition build uses no workspace network API.
export async function cloudRequest(input={},query=''){
  demo??=createLocalWorkspace({storage:localStorage,sessionStorage});
  return demo.request(input,query);
}
