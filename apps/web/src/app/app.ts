import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConsentBanner } from './core/consent/consent-banner/consent-banner';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConsentBanner],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('hb-frontend');
}
