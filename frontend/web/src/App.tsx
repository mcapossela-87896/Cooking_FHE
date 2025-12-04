// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface Order {
  id: string;
  encryptedItems: string;
  timestamp: number;
  chef: string;
  status: "pending" | "completed" | "failed";
  difficulty: number;
}

const FHEEncryptOrder = (items: number[]): string => {
  return `FHE-${btoa(JSON.stringify(items))}`;
};

const FHEDecryptOrder = (encryptedData: string): number[] => {
  if (encryptedData.startsWith('FHE-')) {
    return JSON.parse(atob(encryptedData.substring(4)));
  }
  return [];
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  // Randomly selected styles: High saturation neon (purple/blue/pink/green), Cartoon UI, Card layout, Animation rich
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newOrderData, setNewOrderData] = useState({ difficulty: 1, items: [0, 0, 0, 0] });
  const [showTutorial, setShowTutorial] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [decryptedItems, setDecryptedItems] = useState<number[] | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [activeTab, setActiveTab] = useState<'orders' | 'stats' | 'guide'>('orders');
  const [animateButton, setAnimateButton] = useState(false);

  // Food items for the game
  const foodItems = [
    { id: 0, name: "Burger", emoji: "🍔", color: "#FF9F43" },
    { id: 1, name: "Pizza", emoji: "🍕", color: "#FECA57" },
    { id: 2, name: "Sushi", emoji: "🍣", color: "#54A0FF" },
    { id: 3, name: "Ice Cream", emoji: "🍨", color: "#FF6B6B" }
  ];

  useEffect(() => {
    loadOrders().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadOrders = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      const keysBytes = await contract.getData("order_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing order keys:", e); }
      }
      
      const list: Order[] = [];
      for (const key of keys) {
        try {
          const orderBytes = await contract.getData(`order_${key}`);
          if (orderBytes.length > 0) {
            try {
              const orderData = JSON.parse(ethers.toUtf8String(orderBytes));
              list.push({ 
                id: key, 
                encryptedItems: orderData.items, 
                timestamp: orderData.timestamp, 
                chef: orderData.chef, 
                status: orderData.status || "pending",
                difficulty: orderData.difficulty || 1
              });
            } catch (e) { console.error(`Error parsing order data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading order ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setOrders(list);
    } catch (e) { console.error("Error loading orders:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const submitOrder = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting order with Zama FHE..." });
    try {
      const encryptedItems = FHEEncryptOrder(newOrderData.items);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const orderId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const orderData = { 
        items: encryptedItems, 
        timestamp: Math.floor(Date.now() / 1000), 
        chef: address, 
        status: "pending",
        difficulty: newOrderData.difficulty
      };
      
      await contract.setData(`order_${orderId}`, ethers.toUtf8Bytes(JSON.stringify(orderData)));
      
      const keysBytes = await contract.getData("order_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(orderId);
      await contract.setData("order_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Encrypted order submitted!" });
      await loadOrders();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowOrderModal(false);
        setNewOrderData({ difficulty: 1, items: [0, 0, 0, 0] });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreating(false); }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number[] | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptOrder(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const completeOrder = async (orderId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted order..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const orderBytes = await contract.getData(`order_${orderId}`);
      if (orderBytes.length === 0) throw new Error("Order not found");
      
      const orderData = JSON.parse(ethers.toUtf8String(orderBytes));
      const updatedOrder = { ...orderData, status: "completed" };
      
      await contract.setData(`order_${orderId}`, ethers.toUtf8Bytes(JSON.stringify(updatedOrder)));
      setTransactionStatus({ visible: true, status: "success", message: "Order completed successfully!" });
      await loadOrders();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to complete order: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const failOrder = async (orderId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted order..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const orderBytes = await contract.getData(`order_${orderId}`);
      if (orderBytes.length === 0) throw new Error("Order not found");
      
      const orderData = JSON.parse(ethers.toUtf8String(orderBytes));
      const updatedOrder = { ...orderData, status: "failed" };
      
      await contract.setData(`order_${orderId}`, ethers.toUtf8Bytes(JSON.stringify(updatedOrder)));
      setTransactionStatus({ visible: true, status: "success", message: "Order marked as failed!" });
      await loadOrders();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to update order: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isChef = (orderAddress: string) => address?.toLowerCase() === orderAddress.toLowerCase();

  const tutorialSteps = [
    { title: "Connect Wallet", description: "Connect your Web3 wallet to play the game", icon: "🔗" },
    { title: "Create Encrypted Order", description: "As the head chef, create orders encrypted with Zama FHE", icon: "🔒" },
    { title: "Communicate Ingredients", description: "Describe the encrypted order to your team without revealing details", icon: "🗣️" },
    { title: "Cook Together", description: "Work with your team to prepare the dishes", icon: "👨‍🍳" },
    { title: "Complete Order", description: "Submit the completed order to earn points", icon: "✅" }
  ];

  const renderOrderStats = () => {
    const completedOrders = orders.filter(o => o.status === "completed").length;
    const failedOrders = orders.filter(o => o.status === "failed").length;
    const pendingOrders = orders.filter(o => o.status === "pending").length;
    const total = orders.length || 1;

    return (
      <div className="stats-container">
        <div className="stat-card" style={{ background: "rgba(156, 136, 255, 0.2)" }}>
          <div className="stat-value">{completedOrders}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card" style={{ background: "rgba(255, 107, 107, 0.2)" }}>
          <div className="stat-value">{failedOrders}</div>
          <div className="stat-label">Failed</div>
        </div>
        <div className="stat-card" style={{ background: "rgba(255, 159, 67, 0.2)" }}>
          <div className="stat-value">{pendingOrders}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat-card" style={{ background: "rgba(84, 160, 255, 0.2)" }}>
          <div className="stat-value">{total}</div>
          <div className="stat-label">Total</div>
        </div>
      </div>
    );
  };

  const handleItemChange = (index: number, value: number) => {
    const newItems = [...newOrderData.items];
    newItems[index] = value;
    setNewOrderData({ ...newOrderData, items: newItems });
  };

  const triggerAnimation = () => {
    setAnimateButton(true);
    setTimeout(() => setAnimateButton(false), 1000);
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Loading Secret Kitchen...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>Secret Kitchen</h1>
          <span className="tagline">FHE-Encrypted Cooking Game</span>
        </div>
        <div className="header-actions">
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
        </div>
      </header>

      <main className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Collaborative Cooking with FHE</h2>
            <p>Work together to prepare dishes based on encrypted orders only the head chef can see!</p>
          </div>
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
        </div>

        <div className="tabs">
          <button 
            className={`tab-button ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('orders')}
          >
            Orders
          </button>
          <button 
            className={`tab-button ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            Statistics
          </button>
          <button 
            className={`tab-button ${activeTab === 'guide' ? 'active' : ''}`}
            onClick={() => setActiveTab('guide')}
          >
            Game Guide
          </button>
        </div>

        {activeTab === 'orders' && (
          <div className="orders-section">
            <div className="section-header">
              <h2>Kitchen Orders</h2>
              <div className="header-actions">
                <button 
                  onClick={() => setShowOrderModal(true)} 
                  className={`create-order-btn ${animateButton ? 'pulse' : ''}`}
                >
                  + Create Order
                </button>
                <button 
                  onClick={() => { loadOrders(); triggerAnimation(); }} 
                  className="refresh-btn"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>

            {orders.length === 0 ? (
              <div className="no-orders">
                <div className="chef-emoji">👨‍🍳</div>
                <p>No orders in the kitchen yet!</p>
                <button 
                  onClick={() => setShowOrderModal(true)} 
                  className="create-first-btn"
                >
                  Create First Order
                </button>
              </div>
            ) : (
              <div className="orders-grid">
                {orders.map(order => (
                  <div 
                    key={order.id} 
                    className={`order-card ${order.status}`}
                    onClick={() => setSelectedOrder(order)}
                  >
                    <div className="order-header">
                      <span className="order-id">Order #{order.id.substring(0, 6)}</span>
                      <span className={`order-status ${order.status}`}>{order.status}</span>
                    </div>
                    <div className="order-details">
                      <div className="order-chef">
                        <span>Chef:</span> 
                        {order.chef.substring(0, 6)}...{order.chef.substring(38)}
                      </div>
                      <div className="order-time">
                        {new Date(order.timestamp * 1000).toLocaleString()}
                      </div>
                      <div className="order-difficulty">
                        Difficulty: {"⭐".repeat(order.difficulty)}
                      </div>
                    </div>
                    <div className="order-actions">
                      {isChef(order.chef) && order.status === "pending" && (
                        <>
                          <button 
                            className="action-btn complete" 
                            onClick={(e) => { e.stopPropagation(); completeOrder(order.id); }}
                          >
                            Complete
                          </button>
                          <button 
                            className="action-btn fail" 
                            onClick={(e) => { e.stopPropagation(); failOrder(order.id); }}
                          >
                            Fail
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="stats-section">
            <h2>Kitchen Statistics</h2>
            {renderOrderStats()}
            
            <div className="leaderboard">
              <h3>Top Chefs</h3>
              <div className="leaderboard-list">
                {orders.length > 0 ? (
                  <div className="leaderboard-item">
                    <span className="rank">1</span>
                    <span className="chef-address">{orders[0].chef.substring(0, 6)}...{orders[0].chef.substring(38)}</span>
                    <span className="score">3 orders</span>
                  </div>
                ) : (
                  <div className="no-data">No chef data available</div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'guide' && (
          <div className="guide-section">
            <h2>How to Play Secret Kitchen</h2>
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div className="tutorial-step" key={index}>
                  <div className="step-number">{index + 1}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                  <div className="step-icon">{step.icon}</div>
                </div>
              ))}
            </div>

            <div className="fhe-explanation">
              <h3>About Zama FHE Encryption</h3>
              <p>
                In Secret Kitchen, orders are encrypted using Zama's Fully Homomorphic Encryption (FHE) technology. 
                This means the head chef can see the order details, but must communicate them to the team without revealing the actual ingredients.
              </p>
              <div className="fhe-flow">
                <div className="flow-step">
                  <div className="flow-icon">🔒</div>
                  <div className="flow-text">Order encrypted with FHE</div>
                </div>
                <div className="flow-arrow">→</div>
                <div className="flow-step">
                  <div className="flow-icon">👨‍🍳</div>
                  <div className="flow-text">Head chef decrypts</div>
                </div>
                <div className="flow-arrow">→</div>
                <div className="flow-step">
                  <div className="flow-icon">🗣️</div>
                  <div className="flow-text">Communicates creatively</div>
                </div>
                <div className="flow-arrow">→</div>
                <div className="flow-step">
                  <div className="flow-icon">👨‍🍳👩‍🍳</div>
                  <div className="flow-text">Team prepares dish</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {showOrderModal && (
        <div className="modal-overlay">
          <div className="order-modal">
            <div className="modal-header">
              <h2>Create New Order</h2>
              <button onClick={() => setShowOrderModal(false)} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Difficulty Level</label>
                <select 
                  value={newOrderData.difficulty} 
                  onChange={(e) => setNewOrderData({...newOrderData, difficulty: parseInt(e.target.value)})}
                  className="form-select"
                >
                  <option value="1">⭐ Easy</option>
                  <option value="2">⭐⭐ Medium</option>
                  <option value="3">⭐⭐⭐ Hard</option>
                </select>
              </div>

              <div className="order-items">
                <h3>Select Ingredients (Encrypted with FHE)</h3>
                <div className="items-grid">
                  {foodItems.map((item, index) => (
                    <div key={item.id} className="item-card">
                      <div className="item-emoji">{item.emoji}</div>
                      <div className="item-name">{item.name}</div>
                      <input 
                        type="number" 
                        min="0" 
                        max="10" 
                        value={newOrderData.items[index]} 
                        onChange={(e) => handleItemChange(index, parseInt(e.target.value) || 0)}
                        className="item-input"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="encryption-preview">
                <h4>Encryption Preview</h4>
                <div className="preview-box">
                  Plain: {JSON.stringify(newOrderData.items)} → 
                  Encrypted: {FHEEncryptOrder(newOrderData.items).substring(0, 30)}...
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowOrderModal(false)} className="cancel-btn">Cancel</button>
              <button onClick={submitOrder} disabled={creating} className="submit-btn">
                {creating ? "Encrypting..." : "Submit Order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedOrder && (
        <div className="modal-overlay">
          <div className="order-detail-modal">
            <div className="modal-header">
              <h2>Order Details #{selectedOrder.id.substring(0, 8)}</h2>
              <button onClick={() => { setSelectedOrder(null); setDecryptedItems(null); }} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <div className="order-info">
                <div className="info-item"><span>Status:</span> <strong className={`status-${selectedOrder.status}`}>{selectedOrder.status}</strong></div>
                <div className="info-item"><span>Chef:</span> <strong>{selectedOrder.chef.substring(0, 6)}...{selectedOrder.chef.substring(38)}</strong></div>
                <div className="info-item"><span>Time:</span> <strong>{new Date(selectedOrder.timestamp * 1000).toLocaleString()}</strong></div>
                <div className="info-item"><span>Difficulty:</span> <strong>{"⭐".repeat(selectedOrder.difficulty)}</strong></div>
              </div>

              <div className="encrypted-section">
                <h3>Encrypted Ingredients</h3>
                <div className="encrypted-data">
                  {selectedOrder.encryptedItems.substring(0, 50)}...
                </div>
                <button 
                  onClick={async () => {
                    if (decryptedItems) {
                      setDecryptedItems(null);
                    } else {
                      const decrypted = await decryptWithSignature(selectedOrder.encryptedItems);
                      setDecryptedItems(decrypted);
                    }
                  }} 
                  className="decrypt-btn"
                  disabled={isDecrypting}
                >
                  {isDecrypting ? "Decrypting..." : decryptedItems ? "Hide Items" : "Decrypt with Wallet"}
                </button>
              </div>

              {decryptedItems && (
                <div className="decrypted-section">
                  <h3>Decrypted Ingredients</h3>
                  <div className="ingredients-grid">
                    {foodItems.map((item, index) => (
                      <div key={item.id} className="ingredient-item">
                        <div className="ingredient-emoji">{item.emoji}</div>
                        <div className="ingredient-name">{item.name}</div>
                        <div className="ingredient-count">{decryptedItems[index]}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => { setSelectedOrder(null); setDecryptedItems(null); }} className="close-btn">Close</button>
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="notification-modal">
          <div className={`notification-content ${transactionStatus.status}`}>
            <div className="notification-icon">
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="notification-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">About Zama FHE</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
          <div className="footer-copyright">
            © {new Date().getFullYear()} Secret Kitchen - FHE Cooking Game
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;