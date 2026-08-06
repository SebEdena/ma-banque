import { Component, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

@Component({
  selector: 'app-home',
  imports: [],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  protected readonly dataFolder = signal<string | null>(null);

  constructor() {
    invoke<string | null>('get_current_data_folder')
      .then((folder) => this.dataFolder.set(folder))
      .catch((error: unknown) => {
        console.error('failed to get the current data folder', error);
      });
  }
}
