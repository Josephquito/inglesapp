import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  UsuariosService,
  UsuarioUpdateDto,
  SelectOption,
} from '../../../../services/usuarios.service';

type UsuarioApi = {
  id_usuario: number;
  username: string;
  email: string;
  identificacion: string;
  nombres: string;
  apellidos: string;
  fecha_registro?: string | Date;
  entidad?: any;
  rol?: any;
  estado?: any;
};

type EstadoOption = { value: string; label: string };

@Component({
  selector: 'app-editar-usuario-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './editar-usuario.modal.html',
  styleUrls: ['../usuario.modal.css'],
})
export class EditarUsuarioModalComponent implements OnInit {
  @Input() perfil: any;
  @Input() usuario!: UsuarioApi;

  // 👇 para poder editar entidad/rol desde selects (los cargas en la page y se los pasas)
  @Input() entidades: SelectOption[] = [];
  @Input() roles: any[] = []; // si tu selectOneMenu no es SelectOption, déjalo any y ajustamos

  @Output() close = new EventEmitter<void>();
  @Output() updated = new EventEmitter<void>();

  loading = false;
  error: string | null = null;
  success: string | null = null;

  usernameError: string | null = null;

  // Si no tienes endpoint para estados, usa lista fija
  estados: EstadoOption[] = [
    { value: 'A', label: 'Activo' },
    { value: 'I', label: 'Inactivo' },
    { value: 'B', label: 'Bloqueado' },
    { value: 'E', label: 'Eliminado' },
    { value: 'X', label: 'Requiere cambio contraseña' },
  ];

  form = {
    identificacion: '',
    nombres: '',
    apellidos: '',
    email: '',
    username: '',
    id_entidad: null as number | null,
    rol: null as number | null,
    estado_codigo: '' as string,
    password: '', // opcional
  };

  constructor(private usuariosService: UsuariosService) {}

  ngOnInit(): void {
    this.form.identificacion = this.usuario?.identificacion ?? '';
    this.form.nombres = this.usuario?.nombres ?? '';
    this.form.apellidos = this.usuario?.apellidos ?? '';
    this.form.email = this.usuario?.email ?? '';
    this.form.username = this.usuario?.username ?? '';

    this.form.id_entidad = this.usuario?.entidad?.id_entidad ?? null;

    // tu API de rol puede venir como {id_rol, codigo, nombre} o {id,...}
    this.form.rol = this.usuario?.rol?.id_rol ?? this.usuario?.rol?.id ?? this.usuario?.rol ?? null;

    this.form.estado_codigo = this.usuario?.estado?.codigo ?? '';
  }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close.emit();
    }
  }

  onInputNombreCampo(key: 'nombres' | 'apellidos', value: string) {
    const formatted = value.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
    (this.form as any)[key] = formatted;
  }

  private getEntidadForUsernameCheck(): number | null {
    // si el admin cambió la entidad en el form, usa esa
    if (this.form.id_entidad) return Number(this.form.id_entidad);
    // si no, usa la del usuario
    if (this.usuario?.entidad?.id_entidad) return Number(this.usuario.entidad.id_entidad);
    // fallback
    if (this.perfil?.entidad?.id_entidad) return Number(this.perfil.entidad.id_entidad);
    return null;
  }

  async onUsernameBlur() {
    this.usernameError = null;
    this.error = null;

    const username = (this.form.username || '').trim();
    if (!username) return;

    const idEntidad = this.getEntidadForUsernameCheck();
    if (!idEntidad) return;

    try {
      const disponible = await this.usuariosService.verificarUsernameDisponible(
        username,
        Number(this.usuario.id_usuario),
        Number(idEntidad),
      );

      if (!disponible) {
        this.usernameError = 'El nombre de usuario ya existe en esta institución.';
        this.error = this.usernameError;
      }
    } catch (e: any) {
      this.usernameError = 'Error al verificar username.';
      this.error = e?.error?.message || this.usernameError;
    }
  }

  private buildUpdatePayload(): UsuarioUpdateDto {
    const payload: UsuarioUpdateDto = {};

    // manda solo cambios (update “piola”)
    if (this.form.identificacion.trim() !== (this.usuario.identificacion ?? '')) {
      payload.identificacion = this.form.identificacion.trim();
    }

    if (this.form.nombres.trim() !== (this.usuario.nombres ?? '')) {
      payload.nombres = this.form.nombres.trim();
    }

    if (this.form.apellidos.trim() !== (this.usuario.apellidos ?? '')) {
      payload.apellidos = this.form.apellidos.trim();
    }

    if (this.form.email.trim() !== (this.usuario.email ?? '')) {
      payload.email = this.form.email.trim();
    }

    if (this.form.username.trim() !== (this.usuario.username ?? '')) {
      payload.username = this.form.username.trim();
    }

    const originalEntidad = this.usuario?.entidad?.id_entidad ?? null;
    if (this.form.id_entidad !== null && Number(this.form.id_entidad) !== Number(originalEntidad)) {
      payload.id_entidad = Number(this.form.id_entidad);
    }

    const originalRol =
      this.usuario?.rol?.id_rol ?? this.usuario?.rol?.id ?? this.usuario?.rol ?? null;

    if (this.form.rol !== null && Number(this.form.rol) !== Number(originalRol)) {
      payload.rol = Number(this.form.rol);
    }

    const originalEstado = this.usuario?.estado?.codigo ?? '';
    if ((this.form.estado_codigo || '') !== originalEstado) {
      payload.estado_codigo = this.form.estado_codigo;
    }

    if (this.form.password && this.form.password.trim().length >= 4) {
      payload.password = this.form.password.trim();
    }

    return payload;
  }

  async submit() {
    this.loading = true;
    this.error = null;
    this.success = null;

    try {
      // validación mínima
      if (!this.form.nombres.trim() || !this.form.apellidos.trim()) {
        throw new Error('Nombres y apellidos son obligatorios.');
      }
      if (!this.form.username.trim()) {
        throw new Error('Username es obligatorio.');
      }
      if (this.usernameError) {
        throw new Error(this.usernameError);
      }

      const payload = this.buildUpdatePayload();

      // si no cambió nada
      if (Object.keys(payload).length === 0) {
        this.success = 'No hay cambios para guardar.';
        this.updated.emit();
        return;
      }

      await this.usuariosService.actualizarPerfil(this.usuario.id_usuario, payload);

      this.success = 'Usuario actualizado correctamente';
      this.updated.emit();
    } catch (e: any) {
      this.error = e?.error?.message || e?.message || 'Error al actualizar usuario';
    } finally {
      this.loading = false;
    }
  }

  // por si lo necesitas en template
  Number(v: any) {
    return Number(v);
  }
}
