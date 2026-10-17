import { createBrowserRouter } from "react-router";
import { routes } from "./routes";

export { IndexRedirect, HostIndexRedirect } from "./routes";

export const router = createBrowserRouter(routes);
