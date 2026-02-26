import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-curso-usuarios-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './curso-usuarios-table.component.html',
  styleUrls: ['./curso-usuarios-table.component.css'],
})
export class CursoUsuariosTableComponent {
  @Input() usuarios: any[] = [];
  @Input() isAdmin = false;

  @Output() remove = new EventEmitter<any>();
}
