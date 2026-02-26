import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter, Subscription } from 'rxjs';

type Crumb = { label: string; url: string };

@Component({
  selector: 'app-breadcrumbs',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './breadcrumbs.component.html',
  styleUrls: ['./breadcrumbs.component.css'],
})
export class BreadcrumbsComponent implements OnInit, OnDestroy, OnChanges {
  /** { '12': 'Inglés B2', '88': 'Examen Unidad 1' } */
  @Input() labelMap: Record<string, string> = {};

  crumbs: Crumb[] = [];
  private sub?: Subscription;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    this.build();

    this.sub = this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.build());
  }

  ngOnChanges(changes: SimpleChanges) {
    // ✅ cuando llega el nombre (labelMap cambia), refresca sin navegar
    if (changes['labelMap']) this.build();
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  private build() {
    const url = this.router.url.split('?')[0].split('#')[0];
    const segments = url.split('/').filter(Boolean);

    const ignored = new Set(['curso', 'evaluacion', 'rendiciones', 'intentos']);

    let acc = '';
    const crumbs: Crumb[] = [];

    // contexto: si el seg anterior fue 'curso' o 'evaluacion', entonces el ID tiene tipo
    let lastType: 'curso' | 'eval' | 'intento' | null = null;

    for (const seg of segments) {
      acc += `/${seg}`;

      // marca el tipo del próximo id
      if (seg === 'curso') {
        lastType = 'curso';
        continue;
      }
      if (seg === 'evaluacion') {
        lastType = 'eval';
        continue;
      }
      if (seg === 'intentos') {
        lastType = 'intento';
        continue;
      }

      // oculta segmentos técnicos pero mantiene URL correcta
      if (ignored.has(seg)) continue;

      const isNumeric = /^\d+$/.test(seg);

      // ✅ clave con namespace si es id
      const key = isNumeric && lastType ? `${lastType}:${seg}` : seg;

      // si es id y no hay label aún -> no lo muestres
      if (isNumeric && lastType && !this.labelMap?.[key]) {
        // resetea el tipo consumido
        lastType = null;
        continue;
      }

      const label = this.labelMap?.[key] ?? this.labelMap?.[seg] ?? this.pretty(seg);

      crumbs.push({ label, url: acc });

      // resetea el tipo cuando consumes el id
      if (isNumeric) lastType = null;
    }

    this.crumbs = crumbs;
  }

  private pretty(seg: string) {
    return decodeURIComponent(seg)
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
