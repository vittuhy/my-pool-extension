const BASE_URL = 'https://console.apify.com/admin/users/';

let clients = [];
let favorites = new Set();
let filteredClients = [];

const searchInput = document.getElementById('searchInput');
const clientList = document.getElementById('clientList');
const clearSearch = document.getElementById('clearSearch');

async function init() {
  try {
    await loadFavorites();
    await loadClients();
    searchInput.focus();
    setupEventListeners();
    renderClientList();
  } catch (error) {
    console.error('Error initializing extension:', error);
    clientList.innerHTML = '<div class="empty-state">Error loading clients</div>';
  }
}

async function loadFavorites() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['favorites'], (result) => {
      if (result.favorites) {
        favorites = new Set(result.favorites);
      }
      resolve();
    });
  });
}

async function saveFavorites() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ favorites: Array.from(favorites) }, resolve);
  });
}

async function loadClients() {
  try {
    const response = await fetch(chrome.runtime.getURL('clients.csv'));
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const csvText = await response.text();
    clients = parseCSV(csvText);
    if (clients.length === 0) {
      throw new Error('No clients found in CSV');
    }
    filteredClients = [...clients];
  } catch (error) {
    console.error('Error loading CSV:', error);
    clients = [];
    filteredClients = [];
  }
}

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const clients = [];

  for (let line of lines) {
    if (line.trim()) {
      const parts = line.split(',');
      if (parts.length >= 4) {
        const status = parts[0].trim();
        const name = parts[1].trim();
        const id = parts[2].trim();
        const hubspotLink = parts[3].trim();
        if (status && name && id) {
          clients.push({ status, name, id, hubspotLink });
        }
      }
    }
  }

  return clients;
}

function setupEventListeners() {
  searchInput.addEventListener('input', handleSearch);

  clearSearch.addEventListener('click', () => {
    searchInput.value = '';
    clearSearch.classList.remove('visible');
    filteredClients = [...clients];
    renderClientList();
    searchInput.focus();
  });
}

function handleSearch(e) {
  const query = e.target.value.toLowerCase().trim();
  clearSearch.classList.toggle('visible', query !== '');

  if (query === '') {
    filteredClients = [...clients];
  } else {
    filteredClients = clients.filter(client => {
      const searchString = `${client.status} ${client.name} ${client.id}`.toLowerCase();
      return searchString.includes(query);
    });
  }

  renderClientList();
}

function renderClientList() {
  if (filteredClients.length === 0) {
    const searchTerm = encodeURIComponent(searchInput.value.trim());
    let html = '<div class="empty-state centered">';
    html += '<div class="no-clients-message">No clients found</div>';
    if (searchTerm) {
      html += `<a href="https://console.apify.com/admin/users/${searchTerm}/billing/historical-usage" target="_blank" class="search-console-button">Search in Console</a>`;
    }
    html += '</div>';
    clientList.innerHTML = html;
    return;
  }

  const favoriteClients = filteredClients
    .filter(client => favorites.has(client.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const nonFavoriteClients = filteredClients
    .filter(client => !favorites.has(client.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  let html = '';

  if (favoriteClients.length > 0) {
    html += '<div class="section-header">Favorites</div>';
    favoriteClients.forEach(client => {
      html += renderClientItem(client, true);
    });
  }

  if (favoriteClients.length > 0 && nonFavoriteClients.length > 0) {
    html += '<div class="divider"></div>';
  }

  if (nonFavoriteClients.length > 0) {
    if (favoriteClients.length > 0) {
      html += '<div class="section-header">All Clients</div>';
    }
    nonFavoriteClients.forEach(client => {
      html += renderClientItem(client, false);
    });
  }

  clientList.innerHTML = html;
  addClientEventListeners();
}

function renderClientItem(client, isFavorite) {
  const starIcon = isFavorite ? '★' : '☆';
  const favoriteClass = isFavorite ? 'favorited' : '';

  return `
    <div class="client-item">
      <div class="client-header">
        <div class="client-info">
          <span class="client-status">${client.status}</span>
          <a href="#" class="client-name" data-id="${client.id}">
            ${client.name}
          </a>
        </div>
        <button class="star-button ${favoriteClass}" data-id="${client.id}">
          ${starIcon}
        </button>
      </div>
      <div class="client-id-container">
        <span class="client-id">${client.id}</span>
        <button class="copy-button" data-id="${client.id}" title="Copy ID to clipboard">
          <svg class="copy-icon" viewBox="0 0 24 24">
            <path d="M16 1H4C2.9 1 2 1.9 2 3v14h2V3h12V1zm3 4H8C6.9 5 6 5.9 6 7v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
          </svg>
        </button>
        ${client.hubspotLink ? `
          <a href="${client.hubspotLink}" target="_blank" class="hubspot-link" title="Open in HubSpot">
            <svg class="hubspot-icon" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" fill="none" stroke="#888" stroke-width="1.5"/>
              <path d="M8 7h2.5v4H13V7h2.5v10H13v-4H10.5v4H8z" fill="#888"/>
            </svg>
          </a>
        ` : ''}
      </div>
    </div>
  `;
}

function addClientEventListeners() {
  document.querySelectorAll('.client-name').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const id = e.target.closest('.client-name').dataset.id;
      const url = BASE_URL + id;
      chrome.tabs.create({ url });
    });
  });

  document.querySelectorAll('.star-button').forEach(button => {
    button.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;

      if (favorites.has(id)) {
        favorites.delete(id);
      } else {
        favorites.add(id);
      }

      await saveFavorites();
      renderClientList();
    });
  });

  document.querySelectorAll('.copy-button').forEach(button => {
    button.addEventListener('click', async (e) => {
      const id = e.target.closest('.copy-button').dataset.id;
      try {
        await navigator.clipboard.writeText(id);
        const originalTitle = button.title;
        button.title = 'Copied!';
        setTimeout(() => {
          button.title = originalTitle;
        }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', init);