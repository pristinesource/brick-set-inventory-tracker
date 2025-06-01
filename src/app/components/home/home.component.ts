import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { StorageService } from '../../services/storage.service';
import { UserInventory } from '../../models/models';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  userInventories: UserInventory[] = [];
  loading = true;

  constructor(
    private storageService: StorageService
  ) {}

  ngOnInit(): void {
    // Get user inventories
    this.storageService.getState().subscribe(state => {
      this.userInventories = state.userInventories;
      this.loading = false;
    });
  }
}
