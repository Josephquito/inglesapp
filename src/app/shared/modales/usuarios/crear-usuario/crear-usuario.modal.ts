import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UsuariosService } from '../../../../services/usuarios.service';

type SelectOption = { value: number | string; label: string };

@Component({
  selector: 'app-crear-usuario-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './crear-usuario.modal.html',
  styleUrls: ['../usuario.modal.css'],
})
export class CrearUsuarioModalComponent {
  @Input() perfil: any;

  // ✅ para que el select liste
  @Input() entidades: SelectOption[] = [];
  @Input() roles: SelectOption[] = [];

  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  loading = false;
  error: string | null = null;
  success: string | null = null;

  identificacionError: string | null = null;

  form = {
    identificacion: '',
    email: '',
    nombres: '',
    apellidos: '',
    id_entidad: 0,
    rol: '' as any, // number o string según tu select
  };

  constructor(private usuariosService: UsuariosService) {}

  isAdmin() {
    const rol = this.perfil?.rol?.codigo ?? this.perfil?.rol;
    return rol === 'ADMIN';
  }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
      this.close.emit();
    }
  }

  onInputNombreCampo(key: 'nombres' | 'apellidos', value: string) {
    const formatted = value.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
    (this.form as any)[key] = formatted;
  }

  onIdentificacionInput(value: string) {
    const onlyNums = value.replace(/\D/g, '').slice(0, 10);
    this.form.identificacion = onlyNums;
    this.identificacionError = null;
  }

  async onIdentificacionBlur() {
    this.identificacionError = null;
    this.error = null;

    const { identificacion, id_entidad } = this.form;

    if (this.isAdmin() && !id_entidad) {
      this.identificacionError = 'Debe elegir una institución primero.';
      this.error = this.identificacionError;
      return;
    }

    if (!identificacion) return;

    try {
      const entidadIdFromPerfil = this.perfil?.entidadId ?? this.perfil?.entidad?.id_entidad;
      const idEntidad = Number(this.isAdmin() ? id_entidad : entidadIdFromPerfil);

      const disponible = await this.usuariosService.verificarIdentificacionDisponible(
        identificacion,
        idEntidad,
      );

      if (!disponible) {
        this.identificacionError = 'La identificación ya está registrada en esta institución.';
        this.error = this.identificacionError;
      }
    } catch (e: any) {
      this.identificacionError = 'Error al verificar la identificación.';
      this.error = e?.error?.message || this.identificacionError;
    }
  }

  async submit() {
    this.loading = true;
    this.error = null;
    this.success = null;

    try {
      const entidadIdFromPerfil = this.perfil?.entidadId ?? this.perfil?.entidad?.id_entidad;

      const idEntidadFinal = this.isAdmin()
        ? Number(this.form.id_entidad)
        : Number(entidadIdFromPerfil);

      const rolFinal = this.isAdmin()
        ? Number(this.form.rol)
        : Number(this.perfil?.rol?.id_rol) || 0;

      if (!idEntidadFinal) throw new Error('Entidad no válida');
      if (this.isAdmin() && !rolFinal) throw new Error('Rol no válido');

      const payload = {
        identificacion: this.form.identificacion,
        nombres: this.form.nombres,
        apellidos: this.form.apellidos,
        email: this.form.email,
        id_entidad: idEntidadFinal,
        rol: rolFinal,
        username: this.form.identificacion,
        password: this.form.identificacion,
      };

      await this.usuariosService.crearUsuario(payload);

      this.success = 'Usuario creado correctamente';

      // ✅ reset (igual que React)
      this.form = {
        identificacion: '',
        email: '',
        nombres: '',
        apellidos: '',
        id_entidad: this.isAdmin() ? 0 : Number(this.perfil?.entidad?.id_entidad),
        rol: this.isAdmin() ? '' : this.perfil?.rol?.id_rol || '',
      };

      this.created.emit();
    } catch (e: any) {
      this.error = e?.error?.message || e?.message || 'Error al crear usuario';
    } finally {
      this.loading = false;
    }
  }

  // ✅ helper para [ngValue] en el select
  Number(v: any) {
    return Number(v);
  }
}
