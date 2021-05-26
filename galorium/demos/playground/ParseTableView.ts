import "./styles/ParseTableView.scss";

import * as TSU from "@panyam/tsutils";
import * as TSV from "@panyam/tsutils-ui";
import { App } from "./app";
import * as events from "./events";

export class ParseTableView extends TSV.View {
  readonly app: App;
  headerElement: HTMLDivElement;

  constructor(rootElement: HTMLElement, app: App, config?: TSV.ViewParams) {
    super(rootElement, config);
    this.app = app;
  }

  protected loadChildViews(): void {
    super.loadChildViews();
    this.headerElement = this.find(".inputHeaderArea") as HTMLDivElement;
  }

  eventHubChanged(): void {
    console.log("here: ", this.eventHub);
    this.eventHub?.on(events.ParserCompiled, (evt) => {
      console.log("Parser compiled", evt);
    });
  }
}
