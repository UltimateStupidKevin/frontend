import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './shared/header.component';
import { AuthService } from './core/auth/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent],
  templateUrl: './app.component.html',
  styles: [`
    .container { max-width: 1100px; margin: 0 auto; padding: 16px; }
  `]
})
export class AppComponent {
  // sorgt dafür, dass AuthService früh initialisiert (z. B. für user())
  private _ = inject(AuthService);
}
