import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core"
import { RESOURCE_KIND_ICONS } from "../models/workspace.model"

// The SVG is a mask over currentColor, so each icon takes the colour of the text around it.
@Component({
  selector: "app-kind-icon",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: "",
  host: { "aria-hidden": "true", "[style.mask-image]": "maskImage()" },
  styles: `
    :host {
      display: inline-block;
      width: 1em;
      height: 1em;
      vertical-align: -0.125em;
      background-color: currentColor;
      mask-position: center;
      mask-size: contain;
      mask-repeat: no-repeat;
    }
  `,
})
export class KindIcon {
  readonly kind = input.required<string>()

  protected readonly maskImage = computed(() => {
    const file = RESOURCE_KIND_ICONS[this.kind() as keyof typeof RESOURCE_KIND_ICONS]
    return file ? `url(/icons/${file}.svg)` : "none"
  })
}
